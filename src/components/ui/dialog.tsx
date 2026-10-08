"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  centered,
  ...props
}: React.ComponentPropsWithoutRef<typeof D.Content> & { title: string; description?: string; hideClose?: boolean; centered?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="animate-fade fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "animate-pop fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl focus:outline-none",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className={cn("mb-4", centered ? "text-center" : "pr-8")}>
          <D.Title className="text-lg font-bold tracking-tight">{title}</D.Title>
          {description && <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>}
        </div>
        {children}
        {!hideClose && (
          <D.Close className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}
