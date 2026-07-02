export function getAvatarColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-[#e8f2ff]', text: 'text-[#0070f3]' },
    { bg: 'bg-[#e8fdf0]', text: 'text-[#17c964]' },
    { bg: 'bg-[#fff0f5]', text: 'text-[#f31260]' },
    { bg: 'bg-[#fff8e6]', text: 'text-[#f5a524]' },
    { bg: 'bg-[#f1f1f1]', text: 'text-[#666]' },
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const hasTime = dateStr.includes("T") && !dateStr.endsWith("T00:00") && !dateStr.endsWith("T00:00:00.000Z");
  if (hasTime) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSalary(salary: number): string {
  return `$${(salary / 1000).toFixed(0)}k/yr`;
}

export function formatNumber(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return `$${amount}`;
}
