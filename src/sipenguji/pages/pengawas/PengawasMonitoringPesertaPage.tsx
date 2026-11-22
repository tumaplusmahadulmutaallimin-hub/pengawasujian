import { StudentMonitoringView } from '../../components/StudentMonitoringView';

interface PengawasMonitoringPesertaPageProps {
  initialRoomId?: string;
  initialScheduleId?: string;
}

export function PengawasMonitoringPesertaPage({
  initialRoomId,
  initialScheduleId,
}: PengawasMonitoringPesertaPageProps) {
  return (
    <StudentMonitoringView
      mode="PENGAWAS"
      initialRoomId={initialRoomId}
      initialScheduleId={initialScheduleId}
    />
  );
}
