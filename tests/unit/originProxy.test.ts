import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

const SECRET = 'origen-compartido-con-el-backend-32-bytes';

describe('proxy de /api con secreto de origen', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.PYTHON_API_URL = 'https://api.example.test';
    process.env.ORIGIN_AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

