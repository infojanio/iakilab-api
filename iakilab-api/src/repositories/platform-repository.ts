export interface PlatformRepository {
  laboratories(): Promise<unknown[]>
  plans(): Promise<unknown[]>
  subscriptions(): Promise<unknown[]>
}
