import img1 from "./product-12345/lil-edit-product-1234-1.png";
import img2 from "./product-12345/lil-edit-product-1234-2.png";
import img3 from "./product-12345/lil-edit-product-1234-3.png";
import img4 from "./product-12345/lil-edit-product-1234-4.png";

import p1_img1 from "./product-0001/lil-edit-product-0001-1-1.png";
import p1_img2 from "./product-0001/lil-edit-product-0001-1-2.png";
import p1_img3 from "./product-0001/lil-edit-product-0001-1-3.png";
import p1_img4 from "./product-0001/lil-edit-product-0001-1-4.png";
import p1_img5 from "./product-0001/lil-edit-product-0001-1-5.png";
import p1_img6 from "./product-0001/lil-edit-product-0001-1-6.png";
import p1_img7 from "./product-0001/lil-edit-product-0001-1-7.png";

const product_images: Record<string, Record<string, string>> = {
  "product-12345": {
    "lil-edit-product-1234-1.png": img1,
    "lil-edit-product-1234-2.png": img2,
    "lil-edit-product-1234-3.png": img3,
    "lil-edit-product-1234-4.png": img4,
  },
  "product-0001": {
    "lil-edit-product-0001-1-1.png": p1_img1,
    "lil-edit-product-0001-1-2.png": p1_img2,
    "lil-edit-product-0001-1-3.png": p1_img3,
    "lil-edit-product-0001-1-4.png": p1_img4,
    "lil-edit-product-0001-1-5.png": p1_img5,
    "lil-edit-product-0001-1-6.png": p1_img6,
    "lil-edit-product-0001-1-7.png": p1_img7,
  }
};

export default product_images;
