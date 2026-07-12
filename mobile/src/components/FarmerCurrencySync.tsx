import { useEffect } from 'react';
import { getFarmerDashboard } from '../api/client';
import { useCurrency } from '../context/CurrencyContext';

/** Sync global currency from logged-in farmer's country */
export function FarmerCurrencySync() {
  const { selectCountry } = useCurrency();

  useEffect(() => {
    getFarmerDashboard()
      .then((data) => {
        const farmerCountry = data?.farmer?.country;
        if (farmerCountry) selectCountry(farmerCountry);
      })
      .catch(() => {});
  }, [selectCountry]);

  return null;
}
