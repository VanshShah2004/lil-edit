// General Settings section that links out to the admin email-preview pages. Lets an
// admin eyeball each transactional email (rendered from the real template with sample
// data) without placing a test order or triggering a real send.
import { Link } from "react-router-dom";
import { ChevronRight, Mail, Receipt, Truck } from "lucide-react";

const ACCENT = "#B19CD9";

const PREVIEWS: { to: string; title: string; description: string; icon: typeof Mail }[] = [
  {
    to: "/admin/settings-panel/email-orderconfirmation",
    title: "Order Confirmation",
    description: "The itemized receipt emailed the moment an order is placed.",
    icon: Receipt,
  },
  {
    to: "/admin/settings-panel/status-change",
    title: "Order Status Change",
    description: "The update sent when an order moves to processing, shipped, delivered or cancelled.",
    icon: Truck,
  },
];

const EmailPreviews = () => {
  return (
    <section>
      {/* Section heading — matches the other General Settings sections. */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <Mail className="w-4 h-4" style={{ color: ACCENT }} />
          Email Preview
        </h2>
        <div className="flex-1 h-px bg-gray-900" />
      </div>

      <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-200">
          <p className="text-sm text-gray-600 leading-relaxed">
            See exactly what customers receive before it lands in their inbox. Each preview renders the live email
            template with sample data — nothing is sent.
          </p>
        </div>
        <ul className="divide-y divide-gray-200">
          {PREVIEWS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.to}>
                <Link to={p.to} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default EmailPreviews;
