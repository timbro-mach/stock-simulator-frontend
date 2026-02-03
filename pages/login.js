import { useEffect } from 'react';
import { useRouter } from 'next/router';

const LoginRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
};

export default LoginRedirect;
