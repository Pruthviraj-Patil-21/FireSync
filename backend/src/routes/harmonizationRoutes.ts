import { Router } from 'express';
import { HarmonizationController } from '../controllers/harmonizationController';

const router = Router();

router.post('/run', HarmonizationController.runHarmonization);
router.get('/status', HarmonizationController.getStatus);
router.get('/results', HarmonizationController.getResults);
router.get('/daily', HarmonizationController.getDaily);
router.get('/export', HarmonizationController.exportResults);

export default router;

