  <template>
  <input 
    v-model.number="inputValue"
    @change="confirm"
    @wheel="scrollHandler"
    :class="{'border-red-500': invalid}"

  />
</template>

<script setup lang="ts">

const model = defineModel<number>({ required: true })

const props = withDefaults(defineProps<{
  scrollStep?: number
  min?: number
  max?: number
  currency?: 'cents' | 'dollars'
}>(), {
  scrollStep: 1,
  min: -Infinity,
  max: Infinity
})

const inputValue = ref(model.value)
const invalid = computed(() => !isBetween(inputValue.value, props.min, props.max) || isNaN(inputValue.value))

watch(model, (newValue) => {
  inputValue.value = newValue
})

const confirm = () => {
  if (isNaN(inputValue.value)) {
    inputValue.value = model.value
  } else {
    inputValue.value = clamp(inputValue.value, props.min, props.max)
    model.value = inputValue.value
  }
}

const scrollHandler = useScrollHandler((direction) => {
  inputValue.value += props.scrollStep * direction
  confirm()
})

</script>

