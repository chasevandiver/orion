"use client";
import * as React from "react";
import * as T from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

export const ToastProvider = T.Provider;
export const ToastViewport = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Viewport>) => <T.Viewport className={cn("fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]", className)} {...props} />;
export const Toast = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Root>) => <T.Root className={cn("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg", className)} {...props} />;
export const ToastClose = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Close>) => <T.Close className={cn("absolute right-2 top-2 opacity-0 group-hover:opacity-100", className)} {...props} />;
export const ToastTitle = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Title>) => <T.Title className={cn("text-sm font-semibold", className)} {...props} />;
export const ToastDescription = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Description>) => <T.Description className={cn("text-sm opacity-90", className)} {...props} />;
export type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
export type ToastActionElement = React.ReactElement;
