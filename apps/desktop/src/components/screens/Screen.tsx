import type { ReactNode } from "react";

export function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="screen">
      <main className="screen-body">
        <img src="/icon.png" alt="" className="screen-logo" />
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="screen-actions">{children}</div>
      </main>
    </div>
  );
}
