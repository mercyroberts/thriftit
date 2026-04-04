export interface CountryConfig {
  name: string
  currency: string
  currencySymbol: string
  subscriptionFee: number
  paystackSupported: boolean
}

export const COUNTRIES: Record<string, CountryConfig> = {
  Nigeria: {
    name: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',
    subscriptionFee: 10000,
    paystackSupported: true,
  },
  Ghana: {
    name: 'Ghana',
    currency: 'GHS',
    currencySymbol: 'GH₵',
    subscriptionFee: 80,
    paystackSupported: true,
  },
  Kenya: {
    name: 'Kenya',
    currency: 'KES',
    currencySymbol: 'KSh',
    subscriptionFee: 1500,
    paystackSupported: true,
  },
  'South Africa': {
    name: 'South Africa',
    currency: 'ZAR',
    currencySymbol: 'R',
    subscriptionFee: 200,
    paystackSupported: true,
  },
  Ireland: {
    name: 'Ireland',
    currency: 'EUR',
    currencySymbol: '€',
    subscriptionFee: 10,
    paystackSupported: false,
  },
}

export const VALID_COUNTRY_NAMES = Object.keys(COUNTRIES) as [
  string,
  ...string[],
]

export function getCurrencyForCountry(country: string): string {
  return COUNTRIES[country]?.currency ?? 'NGN'
}

export function getSymbolForCurrency(currency: string): string {
  const entry = Object.values(COUNTRIES).find((c) => c.currency === currency)
  return entry?.currencySymbol ?? currency
}
