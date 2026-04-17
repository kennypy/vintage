import DisputeForm from './DisputeForm';

// Next 15 delivers params as a Promise in dynamic route segments.
export default async function DisputePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <DisputeForm orderId={orderId} />;
}
