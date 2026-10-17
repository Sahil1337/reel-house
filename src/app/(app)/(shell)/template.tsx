/** Re-mounts per navigation so each page fades in (movement dropped for reduced motion). */
export default function ShellTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col animate-[fade-in_280ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
      {children}
    </div>
  );
}
