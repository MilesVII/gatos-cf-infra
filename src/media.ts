import { readdir } from "node:fs/promises";
import { MEDIA_DIR } from "./config";

upload();
async function upload() {
	const files = (await readdir(MEDIA_DIR)).filter(f => !f.startsWith("."));

	for (const file of files) {
		const f = Bun.file(`${MEDIA_DIR}/${file}`);
		const bytes = await f.bytes();
		const r = await fetch(`${process.env.FEED_ENDPOINT_FILES}${file}`, {
			method: "POST",
			body: bytes,
			headers: {
				"x-feed-token": process.env.FEED_TOKEN!
			}
		});
		console.log(r.ok);
		if (r.ok) await f.delete();
	}
}
