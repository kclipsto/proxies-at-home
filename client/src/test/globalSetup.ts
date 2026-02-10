export default function setup() {
    return async function teardown() {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!process.env.VITEST_WORKER_ID) {
            process.exit(0);
        }
    };
}
