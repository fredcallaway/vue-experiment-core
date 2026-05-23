  <template>
  <div 
    class="relative"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :class="{'border-red-500': invalid}"
    @wheel="scrollHandler"
  >
    <input 
      :value="currentRawValue"
      @input="handleInput"
      @change="handleChange"
      w-full
    />
    <Transition>
      <button
        v-if="isHovered"
        @click="reset"
        class="absolute top-0 right-0 text-xs leading-none px0.2 py0 opacity-50 hover:opacity-100"
        type="button"
      >×</button>
    </Transition>
  </div>
</template>

<script setup lang="ts">

const model = defineModel<number>({ required: true })

const props = withDefaults(defineProps<{
  scrollStep?: number
  min?: number
  max?: number
  default?: number
  currency?: 'cents' | 'dollars'
}>(), {
  scrollStep: 1,
  min: -Infinity,
  max: Infinity,
  default: 0
})

const currentRawValue = ref(String(model.value))
const isHovered = ref(false)

const isValid = (val: number) => {
  return !isNaN(val) && isBetween(val, props.min, props.max)
}

const invalid = computed(() => !isValid(Number(currentRawValue.value)))

watch(model, (newValue) => {
  // console.log('👉 model value', newValue)
  assert(isValid(newValue), 'NumberInput: provided v-model is invalid')
  currentRawValue.value = String(newValue)
})

const handleInput = (e: Event) => {
  const raw = (e.target as HTMLInputElement).value
  currentRawValue.value = raw
  const val = Number(raw)
  if (raw != '' && isValid(val)) {
    model.value = val
  }
}


const handleChange = () => {
  const val = Number(currentRawValue.value)
  if (isNaN(val)) {
    model.value = props.default
    currentRawValue.value = String(props.default)
  } else {
    model.value = clamp(val, props.min, props.max)
    currentRawValue.value = String(model.value)
  }
}

const scrollHandler = useScrollHandler((direction) => {
  const newValue = model.value + props.scrollStep * direction
  model.value = round(clamp(newValue, props.min, props.max), 9) // floating point imprecision
})

const reset = () => {
  model.value = props.default
}

</script>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 200ms;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>

