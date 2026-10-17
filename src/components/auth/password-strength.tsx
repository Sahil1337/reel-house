import { FieldDescription } from "@/components/ui/field";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { cn } from "@/lib/utils";

interface Strength {
  score: number;
  label: string;
  indicatorClassName: string;
  labelClassName: string;
}

const LEVELS: Strength[] = [
  {
    score: 0,
    label: "Too short",
    indicatorClassName: "bg-muted-foreground/40",
    labelClassName: "text-muted-foreground",
  },
  { score: 25, label: "Weak", indicatorClassName: "bg-destructive", labelClassName: "text-destructive-foreground" },
  { score: 50, label: "Fair", indicatorClassName: "bg-warning", labelClassName: "text-warning-foreground" },
  { score: 75, label: "Good", indicatorClassName: "bg-info", labelClassName: "text-info-foreground" },
  { score: 100, label: "Strong", indicatorClassName: "bg-success", labelClassName: "text-success-foreground" },
];

function getStrength(password: string): Strength {
  if (password.length < 4) return LEVELS[0];
  let checks = 0;
  if (password.length >= 8) checks += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) checks += 1;
  if (/\d/.test(password)) checks += 1;
  if (/[^A-Za-z0-9]/.test(password)) checks += 1;
  return LEVELS[Math.max(1, checks)];
}

/** Live strength meter from the kit's sign-up card, on Reelhouse tokens. */
export function PasswordStrength({ password }: { password: string }) {
  const strength = getStrength(password);
  return (
    <Meter
      aria-label="Password strength"
      getAriaValueText={() => strength.label}
      value={strength.score}
      className="gap-1.5"
    >
      <MeterTrack className="h-1.5 rounded-full">
        <MeterIndicator className={cn("rounded-full", strength.indicatorClassName)} />
      </MeterTrack>
      <div className="flex w-full items-center justify-between gap-2">
        <FieldDescription>At least 8 characters. Mix in numbers and symbols.</FieldDescription>
        <span className={cn("text-xs font-medium", password ? strength.labelClassName : "text-muted-foreground")}>
          {password ? strength.label : "—"}
        </span>
      </div>
    </Meter>
  );
}
