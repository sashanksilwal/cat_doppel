import { pipeline, env } from "@huggingface/transformers";
import { join } from "node:path";
import { VECTOR_DIMENSIONS } from "./catalog.mjs";

env.cacheDir = join(process.cwd(), ".cache", "transformers");
env.allowLocalModels = true;

let extractorPromise;

function extractor() {
  extractorPromise ||= pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32", { dtype: "q8" });
  return extractorPromise;
}

export async function embedImage(input) {
  const model = await extractor();
  const output = await model(input);
  const values = Array.from(output.data, Number);
  if (values.length !== VECTOR_DIMENSIONS) throw new Error(`Expected ${VECTOR_DIMENSIONS} CLIP values, received ${values.length}.`);
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map(value => value / magnitude);
}
