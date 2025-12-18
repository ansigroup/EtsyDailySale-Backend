declare module "@paddle/paddle-js" {
  export interface Paddle {
    startCheckout?: (...args: any[]) => any;
    updateCheckout?: (...args: any[]) => any;
    // Extend with additional Paddle methods as needed
    [key: string]: any;
  }

  export interface InitializePaddleOptions {
    token: string;
    pwCustomer?: { id: string } | Record<string, unknown>;
  }

  export function initializePaddle(options: InitializePaddleOptions): Promise<Paddle | undefined>;
}
