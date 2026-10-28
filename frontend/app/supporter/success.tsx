import { Redirect, useLocalSearchParams } from 'expo-router';

// Stripe returns here after checkout; hand the session over to the supporter screen, which polls the payment.
export default function SupporterSuccess() {
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  return <Redirect href={{ pathname: '/supporter', params: session_id ? { session_id } : {} }} />;
}
