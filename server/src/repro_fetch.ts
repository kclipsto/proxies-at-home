
import axios from "axios";
import { getImagesForCardInfo } from "./utils/getCardImagesPaged.js";

async function testGoogleDrive() {
    console.log("Testing Google Drive fetch...");
    const id = "1CWXSzPqLMdLZn0AoEb8hWGY0WFuE-UUv"; // From cards.xml
    const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;

    try {
        const r = await axios.get(url, {
            responseType: "stream",
            maxRedirects: 5,
            headers: { "User-Agent": "Mozilla/5.0" },
            validateStatus: () => true,
        });
        console.log(`GDrive Status: ${r.status}`);
        console.log(`GDrive Content-Type: ${r.headers["content-type"]}`);
    } catch (e) {
        console.error("GDrive Fetch Error:", e.message);
    }
}

async function testScryfall() {
    console.log("Testing Scryfall fetch...");
    try {
        const images = await getImagesForCardInfo({ name: "Sol Ring" });
        console.log(`Scryfall Images: ${images.length}`);
        if (images.length > 0) console.log(`First Image: ${images[0]}`);
    } catch (e) {
        console.error("Scryfall Fetch Error:", e.message);
    }
}

async function run() {
    await testGoogleDrive();
    await testScryfall();
}

run();
