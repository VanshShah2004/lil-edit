import { Heart, Package, ShoppingCart } from "lucide-react";

const QuickActions = () => {
  const actions = [
    { icon: <Package className="w-6 h-6 text-primary" />, title: "Track Orders", desc: "View order status" },
    { icon: <Heart className="w-6 h-6 text-primary" />, title: "View Wishlist", desc: "4 items saved" },
    { icon: <ShoppingCart className="w-6 h-6 text-primary" />, title: "Reorder Favorites", desc: "Quick checkout" },
  ];

  return (
    <section className="py-8 px-4">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {actions.map((action, index) => (
            <div key={index} className="bg-white border border-border rounded-2xl p-6 flex items-center gap-5 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                {action.icon}
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg text-foreground">{action.title}</h3>
                <p className="text-sm text-muted-foreground">{action.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default QuickActions;
