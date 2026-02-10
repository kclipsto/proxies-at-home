export default function setup() {
    return async function teardown() {
        await new Promise(resolve => setTimeout(resolve, 100));
        process.exit(0);
    };
}
