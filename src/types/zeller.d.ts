// Minimal typings for @zeller-public/payments-sdk-react-native 0.2.5 (research doc §6).
// The real package ships its own typings – delete this file if they conflict.
declare module '@zeller-public/payments-sdk-react-native' {
  import type { ReactNode } from 'react';
  export function Provider(props: {
    vendorName: string; vendorApplicationName: string; vendorApplicationVersion: string; vendorDeviceType: string;
    environmentUrl?: string; children?: ReactNode;
  }): JSX.Element;
  export function useTerminal(): any;
}
