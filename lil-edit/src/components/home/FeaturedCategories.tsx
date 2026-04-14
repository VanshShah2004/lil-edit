const FeaturedCategories = () => {
  const categories = [
    { title: "Ethnic Wear", img: "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&q=80&w=500" },
    { title: "Accessories", img: "https://images.unsplash.com/photo-1522856339183-5a70f1a9b233?auto=format&fit=crop&q=80&w=500" },
    { title: "Winter Wear", img: "https://images.unsplash.com/photo-1543886562-b91c0ff4e0cb?auto=format&fit=crop&q=80&w=500" },
    { title: "Daily Essentials", img: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&q=80&w=500" },
  ];

  return (
    <section className="py-12 md:py-14 px-4">
      <div className="container mx-auto">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary/80 mb-2">Shop By Category</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground">Featured Categories</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {categories.map((category) => (
            <div key={category.title} className="group cursor-pointer">
              <div className="w-full aspect-square rounded-2xl overflow-hidden mb-3 shadow-sm border border-border bg-card group-hover:shadow-lg transition-all duration-300">
                <img
                  src={category.img}
                  alt={category.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <h3 className="font-display font-medium text-base md:text-lg text-foreground group-hover:text-primary transition-colors">{category.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedCategories;
