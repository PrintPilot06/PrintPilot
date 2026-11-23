import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export function useProfiles() {
  const [printers, setPrinters] = useState([]);
  const [filaments, setFilaments] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, f] = await Promise.all([
        base44.entities.PrinterProfile.list("-created_date", 200),
        base44.entities.FilamentProfile.list("-created_date", 200),
      ]);
      setPrinters(Array.isArray(p) ? p : p?.items || []);
      setFilaments(Array.isArray(f) ? f : f?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { printers, filaments, loading, reload };
}