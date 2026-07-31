
import fs from 'fs';

const content = fs.readFileSync('src/pages/ManageProducts.tsx', 'utf8');
const lines = content.split('\n');

let openDivs = 0;
let closeDivs = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const openMatches = line.match(/<div(?![^>]*\/>)/g); // Only match opening divs, not self-closing
  const closeMatches = line.match(/<\/div>/g);
  
  if (openMatches) openDivs += openMatches.length;
  if (closeMatches) closeDivs += closeMatches.length;
  
  if (openDivs !== closeDivs) {
    // console.log(`${i + 1}: diff ${openDivs - closeDivs}`);
  }
}

console.log(`Total Open Divs: ${openDivs}`);
console.log(`Total Close Divs: ${closeDivs}`);
