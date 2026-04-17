import { Sparkles, Star } from "lucide-react";

const OffersBanner = () => (
  <section className="py-12 md:py-14 px-4">
    <div className="container mx-auto">
      <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 border border-primary/20 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 text-primary/10 -mt-10 -mr-10">
          <Sparkles className="w-64 h-64" />
        </div>
        <div className="z-10">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-foreground px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
            <Star className="w-3.5 h-3.5 fill-current" /> Limited Time
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">Flat 20% Off On New Collection</h2>
          <p className="text-muted-foreground font-body text-lg max-w-md">
            Dress your little ones in the softest, most adorable new season styles.
          </p>
        </div>
        <button className="z-10 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-medium hover:bg-primary/90 transition-all whitespace-nowrap shadow-md">
          Shop the Offer
        </button>
      </div>
    </div>
  </section>
);

export default OffersBanner;
