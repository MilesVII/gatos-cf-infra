import { AutoTokenizer, CLIPTextModelWithProjection, pipeline, Tensor } from "@huggingface/transformers";
import { readdir } from "node:fs/promises";
import { AI_DIR } from "./config";
import { resolve } from "node:path";
import { chunk } from "./commons";

const MODEL = "Xenova/clip-vit-base-patch32";
const extractor = await pipeline("image-feature-extraction", MODEL);

main();
async function main() {
	console.log("Loading pipeline (this may take a bit)...");

	// supply images folder or explicit paths
	const files = await readdir(AI_DIR);
	const paths = files.map(f => `${AI_DIR}/${f}`);
	const embeddings = await encodeBatch(paths);

	// save as JSON (simple); for large datasets consider binary format or vector DB.
	await Bun.write("embeds.json", JSON.stringify(embeddings));
	console.log(`Saved ${Object.keys(embeddings).length} embeddings -> embeddings.json`);
	console.log(await search("vehicle", embeddings))
}

async function encodeBatch(paths: string[]) {
	const result: Record<string, number[]> = {};

	for (const path of paths) {
		console.log(resolve(path))
		const tensor = await extractor(resolve(path));
		result[path] = Array.from(processTensor(tensor)); // store as plain array for JSON save
	}

	return result;
}

function processTensor(tensor: Tensor) {
	return l2Normalize(poolMean(tensor));
}

function l2Normalize(vec: Float32Array) {
	let s = 0;
	for (let i = 0; i < vec.length; i++) s += vec[i] ** 2;
	s = Math.sqrt(s) || 1;
	for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / s;
	return vec;
}

function poolMean(tensor: Tensor) {
	const patches: number[][] = chunk(tensor.data, tensor.dims[1])

	const H = patches[0].length;
	const out = new Float32Array(H);
	for (const row of patches) for (let j = 0; j < H; j++) out[j] += row[j];
	for (let j = 0; j < H; j++) out[j] /= patches.length;
	return out;
}

async function search(query: string, data: Record<string, number[]>) {
	console.log(`\nSearching for: "${query}"`);
	
	const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
	const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { quantized: true });
	const tokens = tokenizer(query, { padding: true, truncation: true });
	const { text_embeds } = await textModel(tokens);
	const text = Array.from(processTensor(text_embeds));

	return Object.entries(data).map(([file, embeds]) => {
		const similarity = cosineSimilarity(text, embeds);
		return { file, score: similarity };
	})
}

function cosineSimilarity(a: number[], b: number[]) {
	let dotProduct = 0;
	for (const i in a) dotProduct += a[i] * b[i];
	return dotProduct;
}
