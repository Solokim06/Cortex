import { SignIn } from "@clerk/nextjs";
import { Link } from "@/i18n/navigation";
import { LifeBuoy } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <SignIn
          fallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/home"
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-card border border-border shadow-none",
            },
          }}
        />
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LifeBuoy className="w-3.5 h-3.5" />
          Need help? Visit our support center
        </Link>
      </div>
    </div>
  );
}
