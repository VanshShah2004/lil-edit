import { useState } from "react";
import { RotateCw } from "lucide-react";
import cardFront from "@/assets/about-card-front-square.png";
import cardBack from "@/assets/about-card-back-square.png";

const FACE_CLASS =
  "absolute inset-0 w-full h-full object-cover rounded-2xl shadow-xl shadow-[#7A6647]/10 ring-1 ring-[#0B5B55]/[0.06] [backface-visibility:hidden]";

type BrandCardFlipProps = {
  /** Sizing/layout for the outer wrapper — the card fills whatever width this gives it. */
  className?: string;
};

/**
 * The visiting card as a single square card that flips between its two faces.
 * Used in the story section on both the home page and the About page, at every width.
 */
const BrandCardFlip = ({
  className = "w-full max-w-[300px] sm:max-w-[340px]",
}: BrandCardFlipProps) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show the front of the card" : "Show contact details on the back of the card"}
        aria-pressed={flipped}
        className="group w-full [perspective:1400px] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5B55]/60 focus-visible:ring-offset-2"
      >
        <div
          className={`relative w-full aspect-square [transform-style:preserve-3d] transition-transform duration-700 ease-out ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front */}
          <img
            src={cardFront}
            alt="The Lil Edit — Designer Kidswear. Culture Meets Cool."
            className={FACE_CLASS}
          />
          {/* Back */}
          <img
            src={cardBack}
            alt="Contact The Lil Edit — phone +91 70453 53952 or +91 98191 75073, Instagram @the.liledit, email shop.theliledit@gmail.com, web www.theliledit.com. Scan the QR code to connect on Instagram."
            className={`${FACE_CLASS} [transform:rotateY(180deg)]`}
          />
        </div>
      </button>

      <span className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
        <RotateCw className="w-3.5 h-3.5" />
        Tap the card to {flipped ? "flip back" : "see our contact details"}
      </span>
    </div>
  );
};

export default BrandCardFlip;
