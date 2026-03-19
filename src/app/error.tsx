"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-lg font-semibold text-red-700">页面出错</h1>
      <pre className="mt-2 overflow-auto rounded bg-gray-100 p-4 text-sm">
        {error.message}
      </pre>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-700"
      >
        重试
      </button>
    </div>
  );
}
