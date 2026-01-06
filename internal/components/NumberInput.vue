  <template>
  <div 
    class="relative"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <input 
      :value="inputValue"
      @input="handleInput"
      @change="handleChange"
      @wheel="scrollHandler"
      :class="{'border-red-500': invalid}"
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

const inputValue = ref(model.value)
const isHovered = ref(false)
const invalid = computed(() => {
  const val = inputValue.value
  if (typeof val !== 'number' || isNaN(val)) return true
  return !isBetween(val, props.min, props.max)
})

watch(model, (newValue) => {
  inputValue.value = newValue
})

const handleInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  if (typeof val === 'number' && !isNaN(val) && isBetween(val, props.min, props.max)) {
    model.value = clamp(val, props.min, props.max)
  }
}

const handleChange = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  if (typeof val !== 'number' || isNaN(val) || !isBetween(val, props.min, props.max)) {
    inputValue.value = props.default
    model.value = props.default
  } else {
    inputValue.value = clamp(val, props.min, props.max)
    model.value = inputValue.value
  }
}

const scrollHandler = useScrollHandler((direction) => {
  const newValue = inputValue.value + props.scrollStep * direction
  inputValue.value = clamp(newValue, props.min, props.max)
  model.value = inputValue.value
})

const reset = () => {
  inputValue.value = props.default
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

