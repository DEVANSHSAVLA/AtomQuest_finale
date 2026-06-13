import express from 'express';
import cors from 'cors';
import * as mediasoup from 'mediasoup';
import { Worker, Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { config } from './config';

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3002;

// ==========================================
// Mediasoup State Store
// ==========================================
const workers: Worker[] = [];
let nextWorkerIndex = 0;

const routers = new Map<string, Router>(); // sessionId -> Router
const transports = new Map<string, WebRtcTransport>(); // transportId -> Transport
const producers = new Map<string, Producer>(); // producerId -> Producer
const consumers = new Map<string, Consumer>(); // consumerId -> Consumer

// Map socket IDs to their allocated transports for cleanups on socket disconnect
const socketTransports = new Map<string, string[]>(); // socketId -> transportId[]

// ==========================================
// Mediasoup Workers Initialization
// ==========================================
async function initializeWorkers() {
  console.log(`Spawning ${config.numWorkers} Mediasoup workers...`);
  
  for (let i = 0; i < config.numWorkers; i++) {
    const worker = await mediasoup.createWorker(config.workerSettings);
    
    worker.on('died', () => {
      console.error(`Mediasoup worker died (pid: ${worker.pid}). Exiting process...`);
      process.exit(1);
    });

    workers.push(worker);
  }
  
  console.log(`Successfully initialized Mediasoup worker pool.`);
}

function getNextWorker(): Worker {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

// ==========================================
// Helper Methods
// ==========================================
async function getOrCreateRouter(sessionId: string): Promise<Router> {
  let router = routers.get(sessionId);
  if (!router) {
    const worker = getNextWorker();
    router = await worker.createRouter({ mediaCodecs: config.routerMediaCodecs });
    routers.set(sessionId, router);
    console.log(`Created new Mediasoup Router for session: ${sessionId}`);
  }
  return router;
}

async function createTransport(router: Router): Promise<WebRtcTransport> {
  const transport = await router.createWebRtcTransport(config.webRtcTransportOptions);
  
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'failed' || dtlsState === 'closed') {
      transport.close();
      transports.delete(transport.id);
    }
  });

  transports.set(transport.id, transport);
  return transport;
}

// ==========================================
// Proxy Controller (HTTP Signaling Broker)
// ==========================================
app.post('/api/v1/media', async (req, res) => {
  const { sessionId, socketId, action, data } = req.body;

  if (!sessionId || !socketId || !action) {
    return res.status(400).json({ success: false, error: 'sessionId, socketId, and action are required' });
  }

  try {
    const router = await getOrCreateRouter(sessionId);

    switch (action) {
      case 'getRouterRtpCapabilities': {
        return res.json({ success: true, data: router.rtpCapabilities });
      }

      case 'createWebRtcTransport': {
        const transport = await createTransport(router);
        
        // Map transport to socket for cleanup tracking
        const socketTps = socketTransports.get(socketId) || [];
        socketTps.push(transport.id);
        socketTransports.set(socketId, socketTps);

        return res.json({
          success: true,
          data: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      }

      case 'connectWebRtcTransport': {
        const { transportId, dtlsParameters } = data;
        const transport = transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        await transport.connect({ dtlsParameters });
        return res.json({ success: true });
      }

      case 'produce': {
        const { transportId, kind, rtpParameters } = data;
        const transport = transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        const producer = await transport.produce({ kind, rtpParameters });
        producers.set(producer.id, producer);

        producer.on('transportclose', () => {
          producer.close();
          producers.delete(producer.id);
        });

        return res.json({ success: true, data: { id: producer.id } });
      }

      case 'consume': {
        const { transportId, producerId, rtpCapabilities } = data;
        
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          return res.status(400).json({ success: false, error: 'Cannot consume producer with client capabilities' });
        }

        const transport = transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true, // Create paused, resume after client sets up
        });

        consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          consumer.close();
          consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          consumer.close();
          consumers.delete(consumer.id);
        });

        return res.json({
          success: true,
          data: {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
          },
        });
      }

      case 'resumeConsumer': {
        const { consumerId } = data;
        const consumer = consumers.get(consumerId);
        if (!consumer) throw new Error('Consumer not found');

        await consumer.resume();
        return res.json({ success: true });
      }

      case 'cleanupSocket': {
        // Cleanup all media transport objects belonging to a disconnected socket
        const clientTps = socketTransports.get(socketId) || [];
        for (const transportId of clientTps) {
          const transport = transports.get(transportId);
          if (transport) {
            transport.close();
            transports.delete(transportId);
          }
        }
        socketTransports.delete(socketId);
        console.log(`Cleaned up media resources for disconnected socket: ${socketId}`);
        return res.json({ success: true });
      }

      default: {
        return res.status(400).json({ success: false, error: `Unknown media action: ${action}` });
      }
    }
  } catch (err: any) {
    console.error(`Media action '${action}' failed:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Start server and initialize worker pool
initializeWorkers().then(() => {
  app.listen(port, () => {
    console.log(`SupportStream Media Server is listening on: http://localhost:${port}`);
  });
});
