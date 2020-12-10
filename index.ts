class EasyWebSocket {
  protected static instance: EasyWebSocket | null
  protected url: string = ''
  socket!: WebSocket
  protected options!: ISocketOptions
  // 队列
  protected queue: Function[] = []
  // 订阅
  protected subscribeList: ISubscribeList = {}

  protected timer!: number
  protected heartbeatTimer!: number
  protected reconnectTimes = 0

  onmessage!: (data: Record<string, any>, ev: MessageEvent) => any | null
  onerror!: (socket: WebSocket, ev: Event) => any | null
  onclose!: (socket: WebSocket, ev: CloseEvent) => any | null

  constructor(url: string, options: ISocketOptions = {}) {
    if (EasyWebSocket.instance) return EasyWebSocket.instance

    this.url = url
    // 初始化配置
    this.assignOptions(options)
    // 判断是否手动启动连接
    this.options.manualOpen && this.connect()
    EasyWebSocket.instance = this
  }

  /**
   * 注册配置
   *
   * @param options 传入配置
   */
  protected assignOptions(options: ISocketOptions) {
    this.options = {
      manualOpen: options.manualOpen || true,
      onOpen: options.onOpen,
      timeout: options.timeout || 30 * 1000,
      maxReconnectTimes: options.maxReconnectTimes || 10,
      subscribeName: options.subscribeName || 'channel',
      subscribeDataName: options.subscribeDataName || 'data',
      heartbeatTimeout: options.heartbeatTimeout || 30 * 1000,
    }
  }

  /**
   * 启动连接 WebSocket
   */
  connect() {
    this.socket = new WebSocket(this.url)
    this.init()
  }

  /**
   * 初始化
   */
  protected init() {
    this.socket.onopen = (ev) => {
      this.options.onOpen && this.options.onOpen(ev)
      // 启动心跳服务
      this.startHeartbeat()
      // 消费队列
      this.runQueue()
    }

    this.socket.onmessage = (ev) => {
      // 重置连接次数 / 重置定时器
      this.reconnectTimes = 0
      this.timer && clearTimeout(this.timer)

      try {
        const data = JSON.parse(ev.data)
        this.onmessage && this.onmessage(data, ev)
        // 调用分发订阅函数
        this.callSubscribe(data, ev)
      } catch (e) {
        throw new Error('[socket]: data' + ev.data + 'cannot be parsed json')
      }

      // 消费队列
      this.runQueue()
    }

    this.socket.onerror = (ev) => {
      EasyWebSocket.instance = null
      this.reconnect()
      this.onerror && this.onerror(this.socket, ev)
      console.error('[socket]: reconnect... error: ', ev)
      // 停止心跳检测
      clearTimeout(this.heartbeatTimer)
    }

    this.socket.onclose = (ev) => {
      EasyWebSocket.instance = null
      this.onclose && this.onclose(this.socket, ev)
      // 停止心跳检测
      clearTimeout(this.heartbeatTimer)
    }
  }

  /**
   * 重新连接
   */
  reconnect() {
    if (this.reconnectTimes > (this.options.maxReconnectTimes as number))
      throw new Error(
        '[socket]: maximum reconnect times of ' + this.options.maxReconnectTimes
      )

    if (this.socket.readyState !== this.socket.OPEN) {
      this.reconnectTimes++
      this.connect()
    }
  }

  /**
   * 发送 message
   *
   * @param data
   * @param json default true
   */
  send(data: Record<string, any> | string, json = true) {
    let message = ''

    if (json) message = JSON.stringify(data)

    const method = () => {
      this.socket.send(message)
      // 启动定时器
      this.startTimeOutTimer()
    }

    if (this.socket && this.socket.readyState === this.socket.OPEN) {
      method()
    } else {
      this.pushQueue(() => method())
    }
  }

  /**
   * 订阅消息
   *
   * @param data
   */
  subscribe(data: ISubscribe) {
    const subscribeName = this.options.subscribeName as string
    const subscribeDataName = this.options.subscribeDataName as string
    // 发送信息
    this.send({
      [subscribeName]: data.name,
      [subscribeDataName]: data.data,
    })
    // 写入方法
    this.subscribeList[data.name] = {
      onMessage: data.onMessage,
      onError: data.onError,
    }
  }

  /**
   * 分发订阅
   *
   * @param data
   * @param ev
   */
  callSubscribe(data: Record<string, any>, ev: MessageEvent) {
    try {
      // 查看状态
      const status = data.status
      // 获取订阅名
      const subscribeName = data[this.options.subscribeName as string]
      if (!status || !subscribeName) {
        console.error(
          '[socket]: cannot find status or $options.subscribeName name, please check message'
        )
        return
      }
      if (!this.subscribeList[subscribeName]) return

      if (status === 'success') {
        this.subscribeList[subscribeName].onMessage(data, ev)
      }

      if (status === 'error') {
        if (this.subscribeList[subscribeName].onError) {
          ;(this.subscribeList[subscribeName] as any).onError(data, ev)
        } else {
          console.error(
            '[socket]: subscript some error happened, use view onError method'
          )
        }
      }
    } catch (e) {
      throw new Error(
        '[socket]: please check message have status and $options.subscribeName keys'
      )
    }
  }

  /**
   * 取消订阅
   *
   * @param channel 订阅名
   */
  unsubscribe(channel: string) {
    if (this.subscribeList[channel]) delete this.subscribeList[channel]
  }

  /**
   * 关闭连接
   *
   * @param code
   * @param reason
   */
  close(code = 1000, reason: string | undefined = undefined) {
    this.socket.close(code, reason)
    EasyWebSocket.instance = null
  }

  /**
   * 启动队列
   */
  protected runQueue() {
    this.queue.forEach((fun, index) => {
      fun()
      this.queue.splice(index, 1)
    })
  }

  /**
   * 存入队列
   *
   * @param fun
   */
  protected pushQueue(fun: Function) {
    this.queue.push(fun)
  }

  /**
   * 启动延迟定时器
   */
  protected startTimeOutTimer() {
    this.timer = setTimeout(() => {
      throw new Error('[socket]: received websocket message timeout')
    }, this.options.timeout)
  }

  /**
   * 启动心跳侦测
   */
  protected startHeartbeat() {
    setInterval(() => {
      this.subscribe({
        name: 'ping',
        onMessage: () => {
          // console.log('[socket]: listen heartbeat ok')
        },
        onError: () => {
          // console.log('[socket]: listen heartbeat error')
        },
      })
    }, this.options.heartbeatTimeout)
  }
}
