// @vitest-environment node
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import commentaryModels from '../../commentary-models.json';

const mocks = vi.hoisted(() => ({
  handlers: {},
  bedrock: vi.fn(),
  lambda: vi.fn(),
  server: {
    on: vi.fn((name, handler) => { mocks.handlers[name] = handler; }),
    listen: vi.fn()
  }
}));
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createServer: () => mocks.server, default: { ...actual.default, createServer: () => mocks.server } };
});
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createServer: () => mocks.server, default: { ...actual.default, createServer: () => mocks.server } };
});
vi.mock('vite', () => ({ createServer: async () => ({ middlewares: vi.fn() }) }));
vi.mock('ws', () => ({ WebSocketServer: class { on = vi.fn(); } }));
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class { send = mocks.bedrock; },
  ConverseCommand: class { constructor(input) { this.input = input; } }
}));
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class { send = mocks.lambda; },
  InvokeCommand: class { constructor(input) { this.input = input; } },
  ListFunctionsCommand: class {}
}));
vi.mock('@aws-sdk/client-polly', () => ({
  PollyClient: class {},
  SynthesizeSpeechCommand: class {}
}));

const post = (path, body) => new Promise((resolve) => {
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST', url: path, headers: { host: 'localhost' }
  });
  let status;
  mocks.handlers.request(request, {
    writeHead(value) { status = value; },
    end(value) { resolve({ status, body: JSON.parse(value) }); }
  });
});

beforeAll(async () => {
  vi.stubEnv('E2E_TEST_MODE', '0');
  vi.stubEnv('BEDROCK_MODEL_ID', 'moonshotai.kimi-k2.5');
  vi.stubEnv('COMMENTARY_MAX_TOKENS', '1600');
  vi.stubEnv('LOCAL_COMMENTARY_LAMBDA', 'test-commentary');
  await import('../../dev-server.mjs');
});
afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  mocks.bedrock.mockReset().mockResolvedValue({
    output: { message: { content: [{ text: 'Fight!' }] } }
  });
  mocks.lambda.mockReset();
});

it.each(commentaryModels)('local commentary uses $label with the correct image capability', async (model) => {
  const sessionId = `test-${model.id}`;
  for (const role of ['player1', 'player2']) {
    await post('/api/webcam-upload', {
      sessionId, role, phase: 'START', image: 'data:image/jpeg;base64,aW1hZ2U='
    });
  }
  const response = await post('/api/live-status', {
    sessionId, modelId: model.id, agentImagePolicy: 'always', isReset: true
  });
  expect(response.status).toBe(200);
  const input = mocks.bedrock.mock.calls[0][0].input;
  expect(input.modelId).toBe(model.id);
  expect(input.inferenceConfig.maxTokens).toBe(1600);
  const images = input.messages[0].content.filter((part) => 'image' in part);
  expect(images).toHaveLength(model.supportsImages ? 2 : 0);
  expect(response.body.debugImageContext.shouldAttachImage).toBe(model.supportsImages);
});

it('defaults to Kimi K2.5', async () => {
  await post('/api/live-status', { agentImagePolicy: 'never' });
  expect(mocks.bedrock.mock.calls[0][0].input.modelId).toBe('moonshotai.kimi-k2.5');
});

it.each(['unsupported', '', null, []])('rejects invalid model %j without contacting AWS', async (modelId) => {
  const response = await post('/api/live-status', { modelId });
  expect(response.status).toBe(400);
  expect(mocks.bedrock).not.toHaveBeenCalled();
  expect(mocks.lambda).not.toHaveBeenCalled();
});

it('keeps the selected text-only model and omits uploads on deployed fallback', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.bedrock.mockRejectedValue(new Error('unavailable'));
  mocks.lambda.mockResolvedValue({
    Payload: Buffer.from(JSON.stringify({
      statusCode: 200, body: JSON.stringify({ commentary: 'Fight!', ttsMode: 'aws', audioUrl: 'https://audio.test' })
    }))
  });
  const response = await post('/api/battle-result', {
    sessionId: 'test-deepseek.v3.2', modelId: 'deepseek.v3.2', agentImagePolicy: 'always'
  });
  expect(response.status).toBe(200);
  expect(mocks.lambda).toHaveBeenCalledTimes(1);
  const request = JSON.parse(Buffer.from(mocks.lambda.mock.calls[0][0].input.Payload).toString());
  expect(request.path).toBe('/api/battle-result');
  expect(JSON.parse(request.body)).toMatchObject({
    modelId: 'deepseek.v3.2', agentImagePolicy: 'never', agent_type: 'local_direct'
  });
  warn.mockRestore();
});
