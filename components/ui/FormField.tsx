interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

export default function FormField({ label, required, error, children, hint }: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#444] uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-[#f31260] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[10px] text-[#999] mt-1">{hint}</p>}
      {error && <p className="text-[10px] text-[#f31260] mt-1">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors bg-white";

export const selectClass =
  "w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0070f3] transition-colors bg-white cursor-pointer appearance-none";
