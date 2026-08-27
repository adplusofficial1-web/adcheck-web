// Small "จดทะเบียนพาณิชย์อิเล็กทรอนิกส์" trust badge — the DBD (กรมพัฒนาธุรกิจการค้า)
// logo confirming this business is a registered legal entity in Thailand.
// Two layouts share one image so the badge always looks consistent:
//   - "footer": logo + one line of caption text, for the site footer.
//   - "compact": logo only, for tight spots like the checkout pay button.
export function DbdTrustBadge({
  variant = "footer",
  className = "",
}: {
  variant?: "footer" | "compact";
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <img
        src="/dbd-logo.png"
        alt="จดทะเบียนพาณิชย์อิเล็กทรอนิกส์กับกรมพัฒนาธุรกิจการค้า (DBD)"
        className={`h-6 w-auto ${className}`}
      />
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 rounded-lg border border-border bg-page px-3 py-2 ${className}`}>
      <img src="/dbd-logo.png" alt="DBD Registered" className="h-8 w-auto shrink-0" />
      <span className="text-[11px] leading-snug text-tertiary max-w-[160px]">
        จดทะเบียนพาณิชย์อิเล็กทรอนิกส์
        <br />
        กับกรมพัฒนาธุรกิจการค้า
      </span>
    </div>
  );
}
