import { Star } from "lucide-react";

const testimonials = [
  { name: "Priya M.", text: "The softest onesies I've ever felt! My baby loves them.", rating: 5 },
  { name: "Ananya R.", text: "Gorgeous packaging and the quality is absolutely premium. Will order again!", rating: 5 },
  { name: "Sneha K.", text: "Finally a brand that gets it — cute AND comfortable. Obsessed!", rating: 5 },
];

const TestimonialSection = () => (
  <section className="container mx-auto px-4 lg:px-8 py-20">
    <div className="text-center mb-12">
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">Loved by Parents</h2>
      <p className="text-muted-foreground font-body">What our happy families are saying</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {testimonials.map((t, i) => (
        <div
          key={i}
          className="bg-card/90 backdrop-blur-[1px] rounded-2xl p-8 border border-border/70 shadow-sm shadow-primary/[0.04] hover:shadow-md hover:border-border transition-all duration-300"
        >
          <div className="flex gap-1 mb-4">
            {Array.from({ length: t.rating }).map((_, j) => (
              <Star key={j} className="h-4 w-4 text-primary fill-primary" />
            ))}
          </div>
          <p className="font-body text-foreground/80 mb-6 leading-relaxed italic">"{t.text}"</p>
          <p className="font-body text-sm font-semibold text-foreground">— {t.name}</p>
        </div>
      ))}
    </div>
  </section>
);

export default TestimonialSection;
