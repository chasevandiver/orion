"use client";

import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

type Toast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactElement;
};

const listeners: Array<(state: Toast[]) => void> = [];
let memoryState: Toast[] = [];

function dispatch(toast: Toast) {
  memoryState = [...memoryState, toast];
  listeners.forEach((listener) => listener(memoryState));
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>(memoryState);

  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const index = listeners.indexOf(setToasts);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    toasts,
    toast: (props: Omit<Toast, "id">) =>
      dispatch({ ...props, id: Math.random().toString() }),
  };
}
