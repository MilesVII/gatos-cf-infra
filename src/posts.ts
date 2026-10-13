import { TelegramClient } from "telegram";
import { Api } from "telegram/tl/index.js";
import { StringSession } from "telegram/sessions/index.js";
// @ts-ignore
import input from "input";
import { MEDIA_DIR } from "./config";
import {dirname, resolve} from "path";

const apiId = parseInt(process.env.TG_API_ID!, 10);
const apiHash = process.env.TG_API_HASH!;
const stringSession = new StringSession(process.env.TG_API_SESSION ?? "");

const STRIDE = 100;

feedPosts();
async function feedPosts() {
	const client = await init();
	let lastKnown = parseInt(await Bun.file("lastKnown.txt").text(), 10);

	while (true) {
		const batch = await fetchFrom(client, lastKnown);
		const messages = groupMessages(clear(batch.messages)).slice(0, -1); // omit last group as it may be incomplete
		if (messages.length === 0) {
			console.log("nothing to fetch");
			await client.disconnect();
			return;
		}
		lastKnown = messages[messages.length - 1].id;

		for (const m of messages) {
			const media = (m.mediaGroup ?? [m.media.photo!]) as Api.Photo[];
			console.log("media count ", media.length)
			const pfr = await fetch(process.env.FEED_ENDPOINT_POSTS!, {
				method: "POST",
				body: JSON.stringify({
					caption: m.message ?? "",
					id: m.id,
					time: m.date,
					mediaCount: media.length
				}),
				headers: {
					"x-feed-token": process.env.FEED_TOKEN!
				}
			});
			console.log(`post ${m.id} feed: ${pfr.ok}`)

			let mediaCounter = 0;
			for (const p of media) {
				const name = `${MEDIA_DIR}/tg${m.id}-${mediaCounter}`;
				if (await Bun.file(name).exists()) continue;

				const sizes = new Set(p.sizes.map(s => s.type));
				const sizePriority = ["x", "m", "i"];
				let size: null | string = null;
				for (const sp of sizePriority)
					if (sizes.has(sp)) {
						size = sp;
						break;
					}
				if (!size) {
					console.warn("no sizes for", m.id, p.sizes.map(s => s.type));
					continue;
				}
				const bytes = await dl(client, p, size);
				await Bun.write(name, bytes);
				++mediaCounter;
			}
			console.log(`post ${m.id} loaded`)
		}
		await Bun.write("lastKnown.txt", `${lastKnown}`);
	}
};

async function init() {
	const client = new TelegramClient(stringSession, apiId, apiHash, {
		connectionRetries: 5,
	});
	await client.start({
		phoneNumber: async () => await input.text("Please enter your number: "),
		password: async () => await input.text("Please enter your password: "),
		phoneCode: async () => await input.text("Please enter the code you received: "),
		onError: (err) => console.log(err),
	});
	console.log("You should now be connected.");
	console.log(client.session.save()); // Save this string to avoid logging in again
	return client;
}

type ClearedMessages = ReturnType<typeof clear>;
function clear(messages: Api.Message[]) {
	return messages
		.filter(m => m.media?.className === "MessageMediaPhoto")
		.map(m => ({
			id: m.id,
			date: m.date,
			message: m.message,
			media: m.media as Api.MessageMediaPhoto,
			groupedId: m.groupedId?.toString() ?? "",
			mediaGroup: null as (Api.Photo[] | null)
		}));
}

type GroupedMessages = ReturnType<typeof groupMessages>;
function groupMessages(messages: ClearedMessages) {
	const { atoms, arranged }: {
		atoms: ClearedMessages,
		arranged: ClearedMessages
	} = {
		atoms: [],
		arranged: [],
		...Object.groupBy(messages, m => m.groupedId ? "atoms" : "arranged")
	};
	const grouped = Object.groupBy(atoms, i => i.groupedId!.toString());

	for (const group of Object.values(grouped)) {
		if (!group) continue; // >_> it's guaranteed to be defined, come on

		group.sort((a, b) => a.id - b.id);
		const p = group.map(m => m.media.photo) as Api.Photo[];
		group[0].mediaGroup = p;
		arranged.push(group[0]);
	}

	return arranged.sort((a, b) => a.id - b.id);
}


async function fetchFrom(client: TelegramClient, from: number) {
	const batch = await client.getMessages("-1001478363441", {minId: from, maxId: from + STRIDE, waitTime: 1200});
	batch.sort((a, b) => a.id - b.id);
	const lastKnown = batch[batch.length - 1].id;
	return {
		lastKnown,
		messages: batch
	};
}

async function dl(client: TelegramClient, photo: Api.Photo, size: string) {
	return await client.downloadFile(
		new Api.InputPhotoFileLocation({
			id: photo.id,
			accessHash: photo.accessHash,
			fileReference: photo.fileReference,
			thumbSize: size
		}),
		{
			dcId: photo.dcId
		}
	) as Buffer;
}
