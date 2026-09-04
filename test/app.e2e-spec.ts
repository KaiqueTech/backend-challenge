import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { App } from 'supertest/types.js';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/http/http-exception.filter.js';

process.env.SQS_CONSUMER_ENABLED = 'false';
process.env.SQS_PUBLISHER_ENABLED = 'false';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('exposes Prometheus metrics and propagates correlation ids', async () => {
    await request(app.getHttpServer())
      .get('/metrics')
      .set('x-correlation-id', 'e2e-correlation')
      .expect(200)
      .expect('content-type', /text\/plain/)
      .expect((response) => {
        expect(response.headers['x-correlation-id']).toBe('e2e-correlation');
        expect(response.text).toContain('wager_processing_latency_seconds_count');
      });
  });

  it('processes and replays a wager without duplicating the ledger', async () => {
    const walletResponse = await request(app.getHttpServer())
      .post('/wallets')
      .send({ playerId: `http-player-${Date.now()}`, initialBalance: { amount: '100.00', currency: 'BRL' } })
      .expect(201);
    const wallet = walletResponse.body;

    await request(app.getHttpServer()).get(`/wallets/${wallet.id}`).expect(200).expect((response) => {
      expect(response.body.balance).toBe('100.00');
      expect(response.body.version).toBe(1);
    });

    const idempotencyKey = `http-key-${Date.now()}`;
    const wager = { providerId: 'http-provider', externalTransactionId: `http-bet-${Date.now()}`, playerId: wallet.playerId, walletId: wallet.id, roundId: 'http-round', kind: 'BET', money: { amount: '80.00', currency: 'BRL' } };
    const first = await request(app.getHttpServer()).post('/wagering/transactions').set('Idempotency-Key', idempotencyKey).send(wager).expect(200);
    const replay = await request(app.getHttpServer()).post('/wagering/transactions').set('Idempotency-Key', idempotencyKey).send(wager).expect(200);

    expect(first.body.status).toBe('PROCESSED');
    expect(first.body.balance).toBe('20.00');
    expect(replay.body.transactionId).toBe(first.body.transactionId);
    expect(replay.body.idempotentReplay).toBe(true);

    await request(app.getHttpServer()).get(`/wallets/${wallet.id}/ledger`).expect(200).expect((response) => {
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items.filter((item: { type: string }) => item.type === 'DEBIT')).toHaveLength(1);
    });
    await request(app.getHttpServer()).get(`/transactions/${first.body.transactionId}`).expect(200);
    await request(app.getHttpServer()).get(`/providers/http-provider/transactions/${wager.externalTransactionId}`).expect(200);
    await request(app.getHttpServer()).post(`/wallets/${wallet.id}/reconciliation`).expect(201).expect((response) => {
      expect(response.body.consistent).toBe(true);
      expect(response.body.storedBalance).toBe('20.00');
    });
    await request(app.getHttpServer()).get('/metrics').expect(200).expect((response) => {
      expect(response.text).toContain('wager_transactions_total{status="PROCESSED"}');
      expect(response.text).toContain('wager_processing_latency_seconds_count');
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
