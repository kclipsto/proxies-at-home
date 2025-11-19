
import axios from "axios";

const API_BASE = "http://localhost:3001";

async function testFrontEndpoint() {
    console.log("Testing GET /api/cards/images/front...");
    const id = "1CWXSzPqLMdLZn0AoEb8hWGY0WFuE-UUv"; // From cards.xml
    const url = `${API_BASE}/api/cards/images/front?id=${encodeURIComponent(id)}`;

    try {
        const r = await axios.get(url, {
            responseType: "stream",
            validateStatus: () => true,
        });
        console.log(`Front Endpoint Status: ${r.status}`);
        console.log(`Front Endpoint Content-Type: ${r.headers["content-type"]}`);
        if (r.status >= 400) {
            console.log("Response data:", r.data);
        }
    } catch (e) {
        console.error("Front Endpoint Error:", e.message);
        if (e.response) {
            console.error("Response status:", e.response.status);
            console.error("Response data:", e.response.data);
        }
    }
}

async function testProxyEndpoint() {
    console.log("Testing GET /api/cards/images/proxy...");
    const targetUrl = "https://cards.scryfall.io/png/front/e/e/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad.png?1752944480";
    const url = `${API_BASE}/api/cards/images/proxy?url=${encodeURIComponent(targetUrl)}`;

    try {
        const r = await axios.get(url, {
            responseType: "arraybuffer",
            validateStatus: () => true,
        });
        console.log(`Proxy Endpoint Status: ${r.status}`);
        console.log(`Proxy Endpoint Content-Type: ${r.headers["content-type"]}`);
    } catch (e) {
        console.error("Proxy Endpoint Error:", e.message);
    }
}

async function run() {
    await testFrontEndpoint();
    await testProxyEndpoint();
}

run();
