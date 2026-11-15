import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HarmonizationService } from '../services/harmonizationService';
import { HarmonizationMatchClass } from '@prisma/client';

const runHarmonizationSchema = z.object({
  regionName: z.string().trim().min(1).max(120).optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLon: z.coerce.number().min(-180).max(180).optional(),
  maxLon: z.coerce.number().min(-180).max(180).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  spatialDistanceM: z.coerce.number().min(50).max(50000).optional(),
  timeWindowMinutes: z.coerce.number().min(1).max(1440).optional(),
  gridResolutionM: z.coerce.number().min(50).max(100000).optional()
});

export class HarmonizationController {
  public static async runHarmonization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = runHarmonizationSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid harmonization parameters',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        });
        return;
      }

      const data = parsed.data;
      if (
        (data.minLat !== undefined && data.maxLat !== undefined && data.minLat > data.maxLat) ||
        (data.minLon !== undefined && data.maxLon !== undefined && data.minLon > data.maxLon)
      ) {
        res.status(400).json({ success: false, error: 'Bounding box min coordinates must not exceed max coordinates' });
        return;
      }

      let startDate: Date | undefined;
      let endDate: Date | undefined;
      if (data.startDate) {
        startDate = new Date(data.startDate);
        if (Number.isNaN(startDate.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid startDate format' });
          return;
        }
      }
      if (data.endDate) {
        endDate = new Date(data.endDate);
        if (Number.isNaN(endDate.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid endDate format' });
          return;
        }
      }

      const result = await HarmonizationService.executeHarmonizationRun({
        regionName: data.regionName,
        minLat: data.minLat,
        maxLat: data.maxLat,
        minLon: data.minLon,
        maxLon: data.maxLon,
        startDate,
        endDate,
        spatialDistanceM: data.spatialDistanceM ?? 1500,
        timeWindowMinutes: data.timeWindowMinutes ?? 60,
        gridResolutionM: data.gridResolutionM ?? 1000
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await HarmonizationService.getLatestStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.query.runId ? String(req.query.runId) : undefined;
      const matchClassRaw = req.query.matchClass ? String(req.query.matchClass).toUpperCase() : undefined;
      let matchClass: HarmonizationMatchClass | undefined;

      if (matchClassRaw) {
        if (
          matchClassRaw !== 'CANDIDATE_MATCH' &&
          matchClassRaw !== 'MODIS_ONLY' &&
          matchClassRaw !== 'VIIRS_ONLY'
        ) {
          res.status(400).json({
            success: false,
            error: 'Invalid matchClass. Expected CANDIDATE_MATCH, MODIS_ONLY, or VIIRS_ONLY'
          });
          return;
        }
        matchClass = matchClassRaw as HarmonizationMatchClass;
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const results = await HarmonizationService.getResults({
        runId,
        matchClass,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
        offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
      });

      res.json({
        success: true,
        data: {
          run: results.run,
          items: results.items
        },
        meta: {
          total: results.total,
          limit,
          offset,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getDaily(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.query.runId ? String(req.query.runId) : undefined;
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (req.query.startDate) {
        startDate = new Date(String(req.query.startDate));
        if (Number.isNaN(startDate.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid startDate query parameter' });
          return;
        }
      }
      if (req.query.endDate) {
        endDate = new Date(String(req.query.endDate));
        if (Number.isNaN(endDate.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid endDate query parameter' });
          return;
        }
      }

      const data = await HarmonizationService.getDailySummaries({ runId, startDate, endDate });
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  public static async exportResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = req.query.runId ? String(req.query.runId) : undefined;
      const format = (req.query.format ? String(req.query.format) : 'csv').toLowerCase();
      const type = (req.query.type ? String(req.query.type) : 'matches').toLowerCase();
      const matchClassRaw = req.query.matchClass ? String(req.query.matchClass).toUpperCase() : undefined;

      let matchClass: HarmonizationMatchClass | undefined;
      if (matchClassRaw) {
        if (
          matchClassRaw !== 'CANDIDATE_MATCH' &&
          matchClassRaw !== 'MODIS_ONLY' &&
          matchClassRaw !== 'VIIRS_ONLY'
        ) {
          res.status(400).json({
            success: false,
            error: 'Invalid matchClass. Expected CANDIDATE_MATCH, MODIS_ONLY, or VIIRS_ONLY'
          });
          return;
        }
        matchClass = matchClassRaw as HarmonizationMatchClass;
      }

      if (type === 'daily') {
        if (format !== 'csv') {
          res.status(400).json({ success: false, error: 'Daily summaries export only supports format=csv' });
          return;
        }
        const csvData = await HarmonizationService.exportDailySummariesToCsv({ runId });
        const filename = `harmonization_daily_${runId || 'latest'}_${Date.now()}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csvData);
        return;
      }

      if (format === 'geojson') {
        const geojson = await HarmonizationService.exportMatchesToGeoJson({ runId, matchClass });
        const filename = `harmonization_matches_${runId || 'latest'}_${Date.now()}.geojson`;
        res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).json(geojson);
        return;
      }

      const csvData = await HarmonizationService.exportMatchesToCsv({ runId, matchClass });
      const filename = `harmonization_matches_${runId || 'latest'}_${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  }
}

