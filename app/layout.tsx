import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas ELN · 探索计划",
  description: "跨学科实验计划与实验记录管理原型。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
