"use client";
import * as React from "react";
import * as DialogPrimitives from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitives.Root;
const DialogTrigger = DialogPrimitives.Trigger;
const DialogPortal = DialogPrimitives.Portal;
const DialogClose = DialogPrimitives.Close;
const DialogOverlay = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitives.Overlay>) => <DialogPrimitives.Overlay className={cn("fixed inset-0 z-50 bg-black/80", className)} {...props} />;
const DialogContent = ({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitives.Content>) => <DialogPortal><DialogOverlay /><DialogPrimitives.Content className={cn("fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-lg rounded-lg border max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:h-dvh max-sm:rounded-none max-sm:overflow-y-auto", className)} {...props}>{children}</DialogPrimitives.Content></DialogPortal>;
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col space-y-1.5", className)} {...props} />;
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
const DialogTitle = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitives.Title>) => <DialogPrimitives.Title className={cn("text-lg font-semibold", className)} {...props} />;
const DialogDescription = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitives.Description>) => <DialogPrimitives.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
