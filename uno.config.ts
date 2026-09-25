import { defineConfig, presetWind4, transformerDirectives, presetIcons } from 'unocss'
import { colors as unoColors } from 'unocss/preset-mini'
import { cartesian } from './utils/array'

const colors = 'primary red orange yellow green blue purple gray'.split(' ')
const lightnesses = '100 200 300 400 500 600 700 800 900'.split(' ')
const btnSizes = 'xs sm lg'.split(' ')
const textSizes = '2xs xs sm base lg xl 2xl 3xl 4xl'.split(' ')

export default defineConfig({
  shortcuts: [
    // Shared button variants used by PButton and native buttons.
    {
      'btnbase': `
        rounded-md border-none px-4 py-2 text-lg text-white
        active:translate-y-0.1 active:scale-98 transition-transform duration-75
        hover:cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
      `,
      'btn': 'btnbase bg-gray hover:bg-gray-500',
    },
    {
      'btn-primary': 'btnbase bg-primary! hover:bg-primary-500!',
      'btn-red': 'btnbase bg-red! hover:bg-red-500!',
      'btn-orange': 'btnbase bg-orange! hover:bg-orange-500!',
      'btn-yellow': 'btnbase bg-yellow! hover:bg-yellow-500!',
      'btn-green': 'btnbase bg-green! hover:bg-green-500!',
      'btn-blue': 'btnbase bg-blue! hover:bg-blue-500!',
      'btn-purple': 'btnbase bg-purple! hover:bg-purple-500!',
      'btn-gray': 'btnbase bg-gray! hover:bg-gray-500!',
      'btn-xs': 'btn px-1 py-0.5 text-sm',
      'btn-sm': 'btn px-2 py-1 text-base',
      'btn-lg': 'btn px-6 py-3 text-2xl',
    },
    [/^btn-(.+)-(.+)$/, ([, c, s]) => `btn-${s} btn-${c}`],
  ],
  safelist: [
    ...cartesian(colors, lightnesses).map(([c, l]) => `bg-${c}-${l}`),
    ...cartesian(colors, lightnesses).map(([c, l]) => `text-${c}-${l}`),
    ...colors.map(c => `btn-${c}`),
    ...btnSizes.map(s => `btn-${s}`),
    ...cartesian(colors, btnSizes).map(([c, s]) => `btn-${c}-${s}`),
    ...textSizes.map(s => `text-${s}`),
  ],
  presets: [
    presetWind4({
      preflights: {
        reset: true
      }
    }),
    // https://iconify.design/docs/usage/css/unocss/  https://unocss.dev/presets/icons
    presetIcons({
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    })
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    // https://github.com/unocss/unocss/blob/main/packages-presets/preset-mini/src/_theme/colors.ts
    colors: {
      primary: 'hsl(186, 85%, 48%)',
      'primary-700': 'hsl(186, 85%, 20%)',
      'primary-600': 'hsl(186, 85%, 30%)',
      'primary-500': 'hsl(186, 85%, 40%)',
      'primary-400': 'hsl(186, 85%, 48%)',
      'primary-300': 'hsl(186, 85%, 60%)',
      'primary-200': 'hsl(186, 85%, 85%)',
      'primary-100': 'hsl(186, 85%, 90%)',

      warn: unoColors.yellow,
      error: unoColors.red,
      success: unoColors.green,
      info: unoColors.blue,

    }
  }
})
