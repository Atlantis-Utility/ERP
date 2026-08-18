"use client";

import Header from "@/components/layout/Header";
import {
  Phone, Wifi, Cpu, Mail, Cloud, PhoneCall, Smartphone, Router, Tv,
  Package, FileSignature, Printer, Gauge, BarChart3, Globe, ShoppingCart, Headphones,
  Server, Building2, LifeBuoy, Database, GitFork, ShieldCheck, FolderOpen,
} from "lucide-react";
import BrandLogo from "@/components/quick-access/BrandLogo";

interface QuickLink {
  label: string;
  href: string;
  logoFile?: string;
  logoDir?: string;
  domain?: string;
  icon: React.ElementType;
  text: string;
  roundedLogo?: boolean;
}

interface QuickLinkSection {
  title: string;
  links: QuickLink[];
}

const QUICK_LINK_SECTIONS: QuickLinkSection[] = [
  {
    title: "Microsoft",
    links: [
      {
        label: "Microsoft Outlook",
        href: "https://outlook.office.com/mail/",
        logoFile: "outlook.png",
        icon: Mail,
        text: "text-[#b45309]",
      },
      {
        label: "Microsoft OneDrive",
        href: "https://onedrive.live.com/",
        logoFile: "onedrive.png",
        icon: Cloud,
        text: "text-[#0e7490]",
      },
      {
        label: "SharePoint",
        href: "https://atlantisutility0365.sharepoint.com/sites/AtlantisUtility/Shared%20Documents/Forms/AllItems.aspx?FolderCTID=0x0120004342FA737655B441A092D30E64477289&id=%2Fsites%2FAtlantisUtility%2FShared%20Documents%2FAtlantis%20Shared%20Drive",
        logoFile: "sharepoint.png",
        domain: "sharepoint.com",
        icon: FolderOpen,
        text: "text-[#0364b8]",
      },
      {
        label: "Microsoft Admin Center",
        href: "https://admin.cloud.microsoft",
        logoFile: "microsoftadmin.png",
        domain: "microsoft.com",
        icon: ShieldCheck,
        text: "text-[#0078d4]",
      },
    ],
  },
  {
    title: "Monitoring & Platforms",
    links: [
      {
        label: "RingLogix Platform",
        href: "https://atlantisutility.simplelogin.net",
        logoFile: "ringlogix.png",
        icon: Phone,
        text: "text-[#1d4ed8]",
      },
      {
        label: "UniFi Site Manager",
        href: "https://unifi.ui.com",
        logoFile: "unifi.png",
        domain: "ui.com",
        icon: Wifi,
        text: "text-[#16a34a]",
      },
      {
        label: "Grandstream Cloud",
        href: "https://www.gdms.cloud/login",
        logoFile: "gdms.png",
        icon: Cpu,
        text: "text-[#7e22ce]",
      },
      {
        label: "InHand Cloud",
        href: "https://portal.inhandcloud.com/user/login",
        logoFile: "inhand.png",
        domain: "inhandcloud.com",
        icon: Router,
        text: "text-[#dc2626]",
      },
      {
        label: "Apeiron",
        href: "https://dashboard.apeiron.io/accounts/login/?next=/login_success",
        logoFile: "aperion.png",
        domain: "apeiron.io",
        icon: Gauge,
        text: "text-[#6d28d9]",
      },
      {
        label: "Yealink",
        href: "https://us.ymcs.yealink.com/manager/login",
        logoFile: "yealink.jpg",
        domain: "yealink.com",
        icon: Phone,
        text: "text-[#0a5eb0]",
        roundedLogo: true,
      },
      {
        label: "Cloudflare",
        href: "https://dash.cloudflare.com",
        domain: "cloudflare.com",
        icon: Cloud,
        text: "text-[#f38020]",
      },
    ],
  },
  {
    title: "ISPs & Carriers",
    links: [
      {
        label: "Telnyx",
        href: "https://telnyx.com",
        logoFile: "telnyx.png",
        domain: "telnyx.com",
        icon: PhoneCall,
        text: "text-[#111827]",
      },
      {
        label: "Lytewave",
        href: "https://pay.lytwave.com/dashboard/history",
        logoFile: "lytwave.png",
        icon: Wifi,
        text: "text-[#0891b2]",
      },
      {
        label: "T-Mobile Business",
        href: "https://tfb.t-mobile.com/apps/tfb_billing/dashboard",
        logoFile: "tmobile.png",
        icon: Smartphone,
        text: "text-[#e20074]",
      },
      {
        label: "Frontier",
        href: "https://frontier.com",
        logoFile: "frontier.png",
        icon: Router,
        text: "text-[#ff2a00]",
      },
      {
        label: "Spectrum Business",
        href: "https://www.spectrumbusiness.net",
        logoFile: "spectrum.png",
        icon: Tv,
        text: "text-[#0089d1]",
      },
      {
        label: "AT&T Business",
        href: "https://att.com",
        logoFile: "att.png",
        icon: Phone,
        text: "text-[#00a8e0]",
      },
      {
        label: "Advantage WISP",
        href: "https://myaccount.advantagewisp.com/account-manager/",
        logoFile: "advantagewisp.png",
        domain: "advantagewisp.com",
        icon: Building2,
        text: "text-[#15803d]",
      },
    ],
  },
  {
    title: "Other Tools",
    links: [
      {
        label: "Teledynamics",
        href: "https://www.teledynamics.com/ordersAndQuotes",
        logoFile: "teledynamics.png",
        domain: "teledynamics.com",
        icon: Package,
        text: "text-[#0f766e]",
      },
      {
        label: "PandaDoc",
        href: "https://app.pandadoc.com/a/#/settings/billing",
        logoFile: "pandadocs.png",
        domain: "pandadoc.com",
        icon: FileSignature,
        text: "text-[#00b67a]",
      },
      {
        label: "HumbleFax",
        href: "https://humblefax.com/",
        domain: "humblefax.com",
        icon: Printer,
        text: "text-[#4b5563]",
      },
      {
        label: "BizIQ",
        href: "https://customer.biziq.com/",
        logoFile: "biziq.png",
        domain: "biziq.com",
        icon: BarChart3,
        text: "text-[#2563eb]",
      },
      {
        label: "WordPress",
        href: "https://atlantisutility.com/wp-admin/user-new.php",
        logoFile: "wordpress.png",
        domain: "wordpress.org",
        icon: Globe,
        text: "text-[#21759b]",
      },
      {
        label: "VoIP Supply",
        href: "https://www.voipsupply.com/checkout/#shipping",
        logoFile: "voipsupply.png",
        domain: "voipsupply.com",
        icon: ShoppingCart,
        text: "text-[#f97316]",
      },
      {
        label: "Zoho Desk",
        href: "https://desk.zoho.com/agent/atlantisutility/atlantis-utility/tickets/list/all-cases",
        logoFile: "zohodesk.png",
        domain: "zoho.com",
        icon: Headphones,
        text: "text-[#d61a1a]",
      },
      {
        label: "Network Solutions",
        href: "https://www.networksolutions.com/",
        logoFile: "networksolutions.jpg",
        domain: "networksolutions.com",
        icon: Server,
        text: "text-[#0033a0]",
      },
      {
        label: "Freshdesk",
        href: "https://atlantisutilityinc.freshdesk.com/a/tickets/filters/all_tickets",
        logoFile: "freshdesk.png",
        domain: "freshdesk.com",
        icon: LifeBuoy,
        text: "text-[#1fa78f]",
      },
      {
        label: "Supabase",
        href: "https://supabase.com/dashboard",
        logoFile: "supabase.png",
        domain: "supabase.com",
        icon: Database,
        text: "text-[#3ecf8e]",
      },
      {
        label: "GitHub",
        href: "https://github.com",
        logoFile: "github.png",
        domain: "github.com",
        icon: GitFork,
        text: "text-[#111827]",
      },
      {
        label: "Resend",
        href: "https://resend.com",
        logoFile: "resend.png",
        logoDir: "isp-logos",
        domain: "resend.com",
        icon: Mail,
        text: "text-[#111827]",
      },
    ],
  },
];

export default function QuickAccessPage() {
  return (
    <div>
      <Header title="Quick Access" subtitle="One-click links to the tools you use every day" />

      <div className="space-y-8">
        {QUICK_LINK_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[11px] font-semibold text-[#999] uppercase tracking-widest mb-3">
              {section.title}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {section.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border border-[#eaeaea] rounded-xl p-4 bg-white hover:border-[#d4d4d4] hover:shadow-sm transition-all"
                >
                  <div className="w-11 h-11 flex items-center justify-center shrink-0">
                    <BrandLogo
                      logoFile={link.logoFile}
                      logoDir={link.logoDir}
                      domain={link.domain}
                      label={link.label}
                      fallback={link.icon}
                      fallbackClassName={`w-6 h-6 ${link.text}`}
                      size={40}
                      rounded={link.roundedLogo}
                    />
                  </div>
                  <p className="text-sm font-medium text-[#0a0a0a]">{link.label}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
