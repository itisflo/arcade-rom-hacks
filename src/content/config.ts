import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const romFile = z.object({
  name: z.string(),
  crc32: z.number(),
});

const region = z.object({
  base: z.number(),
  size: z.number(),
  high_byte: romFile.optional(),
  low_byte: romFile.optional(),
  file: romFile.optional(),
});

const games = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './games' }),
  schema: z.object({
    name: z.string(),
    manufacturer: z.string(),
    year: z.number(),
    system: z.string(),
    roms: z.object({
      layout: z.enum(['16-bit-interleaved', '16-bit-word-swap']),
      regions: z.array(region),
    }).optional(),
    hacks: z.array(z.object({
      description: z.string(),
      author: z.string().optional(),
      memory: z.array(z.object({
        address: z.number(),
        value: z.number(),
      })).optional(),
    })).optional(),
  }),
});

export const collections = { games };
