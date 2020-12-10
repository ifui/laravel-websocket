interface ISocketOptions {
  // 是否手动启动连接 默认：false
  manualOpen?: boolean
  // 打开连接时运行函数
  onOpen?: (ev: Event) => void
  // 超时时间 默认：30 * 1000
  timeout?: number
  // 心跳检测时间 默认：30 * 1000
  heartbeatTimeout?: number
  // 最大重试次数 默认：10
  maxReconnectTimes?: number
  // 订阅名 默认：channel
  subscribeName?: string
  // 订阅传递参数名 默认：data
  subscribeDataName?: string
}

interface ISubscribe {
  // 订阅名
  name: string
  // 传递参数
  data?: Record<string, any> | string
  // 返回消息订阅函数
  onMessage: (data: Record<string, any>, ev: MessageEvent) => any | null
  // 返回错误消息订阅函数
  onError?: (data: Record<string, any>, ev: MessageEvent) => any | null
}

interface ISubscribeList {
  [index: string]: {
    onMessage: (data: Record<string, any>, ev: MessageEvent) => any | null
    onError?: (data: Record<string, any>, ev: MessageEvent) => any | null
  }
}
