"use client";

export function LiuKanshan() {
  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zhihu-thin glass"
      style={{ borderColor: "rgba(0, 132, 255, 0.2)" }}
    >
      <div className="mx-auto max-w-2xl px-6 py-3">
        <p className="text-xs text-geek-gray-light">
          刘看山提醒：今日知乎热榜中有 3 条讨论与您的技术选型相关。
        </p>
      </div>
    </footer>
  );
}
